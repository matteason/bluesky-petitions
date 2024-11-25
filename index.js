import * as f from './functions.js'

const INTERVAL = 60000
async function processPetitions() {
  try {
    console.log(`${new Date()} - Processing petitions...`)
    await f.authenticate()
    await f.processRecentPetitions()
    await f.processRejectedPetitions()
    await f.processAwaitingResponsePetitions()
    await f.processWithResponsePetitions()
    await f.processAwaitingDebatePetitions()
    await f.processDebatedPetitions()
    f.saveLastDates()
  } catch(e) {
    console.error(e)
  }
  setTimeout(processPetitions, INTERVAL)
}

processPetitions()