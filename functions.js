import lastDates from './data/lastDates.json' assert { type: 'json' }
import fs from 'node:fs'

let PDS_URL
let DID
let ACCESS_JWT
let REFRESH_JWT

export async function authenticate() {
  if(!ACCESS_JWT) {
    // Create a session and fetch our PDS URL (the server that stores this user's data), JWT for authenticating our requests and DID (user's identifier)
    const response = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession',
      {
        method: 'POST',
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          identifier: process.env.BOT_HANDLE,
          password: process.env.BOT_PASSWORD
        })
      })
    const json = await response.json()
    PDS_URL = json.didDoc.service[0].serviceEndpoint
    ACCESS_JWT = json.accessJwt
    REFRESH_JWT = json.refreshJwt
    DID = json.did
  } else {
    // Refresh our session
    const response = await fetch('https://bsky.social/xrpc/com.atproto.server.refreshSession',
      {
        method: 'POST',
        headers: {
          "Authorization": `Bearer ${REFRESH_JWT}`
        }
      })
    const json = await response.json()
    ACCESS_JWT = json.accessJwt
    REFRESH_JWT = json.refreshJwt
  }
}

export function saveLastDates() {
  // We store the last datetime of each petition state that we look at, so that on the next run
  // we can only look at petitions which have entered that state after this time
  try {
    fs.writeFileSync('./data/lastDates.json', JSON.stringify(lastDates));
  } catch (err) {
    console.error(err);
  }
}

export async function processRecentPetitions() {
  const petitions = await getNewPetitionsAtState('recent', 'opened')

  petitions.forEach((p) => {
    const openedDate = new Date(p.attributes.opened_at)
    const deadline = new Date(openedDate.setMonth(openedDate.getMonth() + 6))
    const deadlineStr = deadline.toLocaleDateString("en-GB", {year: "numeric", month: "long", day: "numeric"})
    sendPost(p.attributes[`opened_at`],`New petition: "${p.attributes.action.trim()}"\r\n\r\nDeadline ${deadlineStr}, created by ${p.attributes.creator_name}`, p.links.self.replace('.json',''), `Petition: ${p.attributes.action.trim()}`, p.attributes.background.trim(), '#NewPetition')
  })
}

export async function processRejectedPetitions() {
  const petitions = await getNewPetitionsAtState('rejected', 'rejected')

  petitions.forEach((p) => {
    sendPost(p.attributes[`rejected_at`], `Rejected petition: "${p.attributes.action.trim()}"`, p.links.self.replace('.json',''), `Rejected petition: ${p.attributes.action.trim()}`, p.attributes.background.trim(), '#RejectedPetition')
  })
}

export async function processAwaitingResponsePetitions() {
  const petitions = await getNewPetitionsAtState('awaiting_response', 'response_threshold_reached')

  petitions.forEach((p) => {
    sendPost(p.attributes['response_threshold_reached_at'], `Petition has passed the threshold for a response: "${p.attributes.action.trim()}"\r\n\r\nThe government will respond to this petition as it has ${p.attributes.signature_count} signatures`, p.links.self.replace('.json',''), `Petition: ${p.attributes.action.trim()}`, p.attributes.background.trim(), '#PetitionAwaitingResponse')
  })
}

export async function processWithResponsePetitions() {
  const petitions = await getNewPetitionsAtState('with_response', 'government_response')

  petitions.forEach((p) => {
    sendPost(p.attributes['government_response_at'], `Government has responded to the petition "${p.attributes.action.trim()}"`, p.links.self.replace('.json','')+'#response-threshold-heading', `Petition: ${p.attributes.action.trim()}`, p.attributes.background.trim(), '#PetitionGovResponse')
  })
}

export async function processAwaitingDebatePetitions() {
  const petitions = await getNewPetitionsAtState('awaiting_debate', 'debate_threshold_reached')

  petitions.forEach((p) => {
    sendPost(p.attributes['debate_threshold_reached_at'], `Petition has passed the threshold for a debate: "${p.attributes.action.trim()}"\r\n\r\nParliament will consider this petition for a debate as it has ${p.attributes.signature_count} signatures`, p.links.self.replace('.json',''), `Petition: ${p.attributes.action.trim()}`, p.attributes.background.trim(), '#PetitionAwaitingDebate')
  })
}

export async function processDebatedPetitions() {
  const lastDate = lastDates['debate_outcome']

  const debatedPetitions = await getNewPetitionsAtState('debated', 'debate_outcome')

  debatedPetitions.forEach((p) => {
    sendPost(`Parliament has debated this petition: "${p.attributes.action.trim()}"`, p.links.self.replace('.json','')+'#debate-threshold-heading', `Petition: ${p.attributes.action.trim()}`, p.attributes.background.trim(), '#PetitionDebated')
  })

  // Because 'debated' and 'not_debated' petitions use the same 'debate_outcome' date we have to reset the last date here otherwise we won't pick up new 'not_debated' petitions
  lastDates['debate_outcome'] = lastDate

  const notDebatedPetitions = await getNewPetitionsAtState('not_debated', 'debate_outcome')

  notDebatedPetitions.forEach((p) => {
    sendPost(`The Petitions Committee has decided not to debate this petition: "${p.attributes.action.trim()}"`, p.links.self.replace('.json','')+'#debate-threshold-heading', `Petition: ${p.attributes.action.trim()}`, p.attributes.background.trim(), '#PetitionNotDebated')
  })
}

async function getNewPetitionsAtState(state, date_type) {
  // Fetch all of the petitions at the specified state that have entered that state since our last run
  const response = await fetch(`https://petition.parliament.uk/petitions.json?page=1&state=${state}`)
  const json = await response.json()
  const newPetitionsAtState = json.data.filter((p) => p.attributes[`${date_type}_at`] != null && p.attributes[`${date_type}_at`] > (lastDates[state] ?? '0'))

  if(newPetitionsAtState.length > 0) {
    // There are new petitions, so update our store of last dates
    lastDates[state] = newPetitionsAtState.map((p) => p.attributes[`${date_type}_at`]).sort().reverse()[0]
    console.log(`${newPetitionsAtState.length} new petitions at ${state}`)
  }

  return newPetitionsAtState
}

async function sendPost(d, text, url, linkTitle, linkDescription, hashtag = null) {
  let facets = []

  if(hashtag) {
    const textEncoder = new TextEncoder();

    facets.push(
      {
        index: {
          byteStart: textEncoder.encode(`${text}\r\n\r\n`).length,
          byteEnd: textEncoder.encode(`${text}\r\n\r\n${hashtag}`).length,
        },
        features: [{
          $type: 'app.bsky.richtext.facet#tag',
          tag: hashtag.replace('#', '')
        }]
      }
    )
  }

  const post = {
    "$type": 'app.bsky.feed.post',
    text: `${text}${hashtag ? `\r\n\r\n${hashtag}` : ''}`,
    createdAt: new Date(),
    embed: {
      "$type": 'app.bsky.embed.external',
      external: {
        uri: url,
        title: linkTitle,
        description: linkDescription
      }
    },
    facets: facets
  }

  fetch(PDS_URL+"/xrpc/com.atproto.repo.createRecord",
    {
    method: 'POST',
    headers: {
      "Authorization": `Bearer ${ACCESS_JWT}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      repo: DID,
      collection: "app.bsky.feed.post",
      record: post
    })
  })
}