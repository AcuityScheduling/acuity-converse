const axios = require('axios')

// Make a request to the Init.ai API to send the result of the logic run
// Docs: https://docs.init.ai/docs/webhooks#section-logicinvocation
const sendLogicResult = invocationPayload => result => {
  const {
    current_application: {id: app_id},
    invocation_data: {api: {base_url}, auth_token, invocation_id},
    users,
  } = invocationPayload

  // TODO: This needs to be v2 when released
  const url = `${base_url}/api/v1/remote/logic/invocations/${invocation_id}/result`
  const headers = {
    'authorization': `Bearer ${auth_token}`,
    'content-type': 'application/json',
  }
  const data = {
    invocation: {app_id, app_user_id: Object.keys(users)[0], invocation_id},
    result,
  }

  return axios.request({data, headers, method: 'post', url})
    .catch((error) => {console.log(new Error(error))})
}

module.exports = sendLogicResult
