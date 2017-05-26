/**
 * This module is a reference implementation and not required to use the Init.ai platform.
 *
 * See `server.js` for actual server implementation.
 */
const chalk = require('chalk')
const {copy} = require('copy-paste')
const {spawn} = require('child_process')

const {LOCAL, PORT = 3022} = process.env
const LOG_PREFIX = chalk.cyan.bold('|')

const logProcessMessage = (buffer) => console.log(chalk.gray('  >'), buffer.toString().trim())
const log = (...args) => console.log.apply(console, [LOG_PREFIX].concat(args))

log('Starting server/watch task')
const server = spawn('npm', 'run -s watch -- --ignore app.js --no-colors --quiet'.split(' '))

server.stdout.on('data', logProcessMessage)
server.stderr.on('data', logProcessMessage)
server.on('close', (code) => log(`child process exited with code ${code}`))

// Kill server/watch task on exit
process.on('exit', () => server.kill('SIGTERM'))

if (LOCAL !== 'false') {
  setTimeout(() => {
    // Start ngrok
    const ngrok = require('ngrok')

    log('Establishing ngrok tunnel')

    ngrok.connect(PORT, (error, result) => {
      if (error) {
        log(new Error(error))

        server.kill('SIGTERM')
        return
      }

      try {
        copy(result, () => {
          log('An ngrok tunnel has been established!')
          log(`Your development URL is ${chalk.cyan.underline(result)} (copied to clipboard)`)
        })
      } catch (_) {
        log('An ngrok tunnel has been established!')
        log(`Your development URL is ${chalk.cyan.underline(result)}`)
      }
    })
  }, 1)
} else {
  log('Skipping automatic ngrok configuration')
}
