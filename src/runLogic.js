/**
 * Run Logic for Booking Appointments with Init.ai
 */

const InitClient = require('initai-node');
const AcuityScheduling = require('acuityscheduling');
const moment = require('moment');
const dateFormat = 'MMM D, h:mma';

module.exports = function runLogic(eventData) {
  return new Promise((resolve) => {

    // Create Init.ai client
    const client = InitClient.create(eventData, {succeed: resolve});

    // Create an Acuity client
    const acuity = new AcuityScheduling.basic({
      "userId": process.env.ACUITY_USER_ID,
      "apiKey": process.env.ACUITY_API_KEY
    });


    //
    // Steps:
    //

    const getAppointmentType = client.createStep({
      /**
       * Get the appointment type from the client response.
       */
      extractInfo() {
        // Store the appointment type ID in the conversation state
        const data = client.getPostbackData();
        if (data && data.appointmentTypeID) {
          client.updateConversationState({
            appointmentTypeID: data.appointmentTypeID
          });
        }
      },
      /**
       * Satisfy this step once we have an appointment type:
       */
      satisfied() { return Boolean(client.getConversationState().appointmentTypeID) },
      /**
       * Prompt for an appointment type if we don't have one stored.
       */
      prompt() {

        // Fetch appointment types from Acuity
        acuity.request('/appointment-types', function (err, res, appointmentTypes) {

          // Build some buttons for folks to choose a class
          const replies = appointmentTypes
            // Filter types for public classes
            .filter(appointmentType => appointmentType.type === 'class' && !appointmentType.private)
            // Create a button for each type
            .map(appointmentType => client.makeReplyButton(
              appointmentType.name,
              null,
              'bookClass',
              {appointmentTypeID: appointmentType.id}
            ));

          // Set the response intent to prompt to choose a type
          client.addResponseWithReplies('prompt/type', null, replies);

          // End the asynchronous prompt
          client.done();
        });
      }
    });

    const getDatetime = client.createStep({
      satisfied() { return Boolean(client.getConversationState().datetime) },
      extractInfo() {
        // Store the datetime in the conversation state
        const data = client.getPostbackData();
        if (data && data.datetime) {
          client.updateConversationState({
            datetime: data.datetime
          });
        }
      },
      prompt() {

        // Fetch available class sessions from Acuity using the appointment type:
        const state = client.getConversationState();
        const options = {
          qs: {
            month: moment().format('YYYY-MM'),
            appointmentTypeID: state.appointmentTypeID
          }
        };
        acuity.request('/availability/classes', options, function (err, res, sessions) {

          // Build buttons for choosing a class session:
          const replies = sessions.map(session => client.makeReplyButton(
            moment(session.time).format(dateFormat),
            null,
            'bookClass',
            {datetime: session.time}
          ));

          // Ship the response:
          client.addResponseWithReplies('prompt/datetime', null, replies);
          client.done();
        });
      }
    });

    const getEmail = client.createStep({
      satisfied() { return Boolean(client.getConversationState().email) },
      extractInfo() {
        // Get an e-mail provided by the user:
        const email = client.getFirstEntityWithRole(client.getMessagePart(), 'email/email');
        if (email) {
          client.updateConversationState({ email: email.value });
        }
      },
      prompt() {
        client.addResponse('prompt/email');

        // The getEmail step is used in multiple streams.  If we're not in the
        // default stream, set the expected next step.
        if (client.getStreamName() !== 'bookClass') {
          client.expect(client.getStreamName(), ['provide/email']);
        }
        client.done();
      }
    });

    const getName = client.createStep({
      satisfied() { return Boolean(
        client.getConversationState().firstName &&
        client.getConversationState().lastName)
      },
      extractInfo() {
        // Check for sender name set from Facebook,
        // or use the name provided by the user:
        const sender =  client.getMessagePart().sender;
        const firstName = client.getFirstEntityWithRole(client.getMessagePart(), 'firstName') || sender.first_name;
        const lastName = client.getFirstEntityWithRole(client.getMessagePart(), 'lastName') || sender.last_name;
        if (firstName) {
          client.updateConversationState({ firstName: firstName });
        }
        if (lastName) {
          client.updateConversationState({ lastName: lastName });
        }
      },
      prompt() {
        client.addResponse('prompt/name')
        client.done()
      }
    });

    const bookAppointment = client.createStep({
      // This is the final step:
      satisfied() { return false; },
      prompt() {

        // Get the whole conversation state:
        const state = client.getConversationState();

        // Book the class appointment using the gathered info
        const options = {
          method: 'POST',
          body: {
            appointmentTypeID: state.appointmentTypeID,
            datetime:          state.datetime,
            firstName:         state.firstName,
            lastName:          state.lastName,
            email:             state.email
          }
        };
        acuity.request('/appointments', options, function (err, res, appointment) {

          // Clear out conversation state.  This will reset our satisfied
          // conditions  and the user can schedule again.
          client.updateConversationState({
            appointmentTypeID: null,
            datetime: null
          });

          // Send the confirmation message, with entities for the booking
          client.addResponse('confirmation', {
            type: appointment.type,
            datetime: moment(appointment.datetime).format(dateFormat)
          });
          client.done();
        });
      }
    });

    const getAppointments = client.createStep({
      satisfied() { return false; },
      prompt() {

        // Get upcoming appointments matching an e-mail address:
        const state = client.getConversationState();
        const options = {
          qs: {
            email: state.email,
            minDate: moment().toISOString()
          }
        };
        acuity.request('/appointments', options, function (err, res, appointments) {

          // Decide which response intent to send: the upcoming schedule, or none:
          if (appointments.length) {

            // Sort upcoming classes chronologically and format response
            const classes = "\n" + appointments
              .sort((a, b) => b.datetime < a.datetime )
              .map(appointment =>
                moment(appointment.datetime).format(dateFormat)+': '+appointment.type
              ).join(", \n")

            // Send upcoming appointments intent, with entities:
            client.addResponse('upcoming/appointments', {
              'number/count': appointments.length,
              'classes': classes
            });

          } else {
            // If no appointments, send none intent:
            client.addResponse('upcoming/none');
          }

          // Clear the expected stream after getting appointments:
          client.expect(null);
          client.done();
        });
      }
    });

    // Set up the logic for our flow.
    //
    // We have two separate conversation streams: the default stream for
    // booking a new class, and a separate stream to get current bookings.
    // Conversations default to the bookClass stream, unless we receive a
    // 'check' intent.  Then we'll kick off the getBookings stream.
    client.runFlow({
      classifications: {
        'check': 'getBookings'
      },
      streams: {
        main: 'bookClass',
        bookClass: [getAppointmentType, getDatetime, getName, getEmail, bookAppointment],
        getBookings: [getEmail, getAppointments]
      }
    });

  });
};
