import type { Context } from '@netlify/functions'
import { blobsKv } from './lib/blobsKv'
import { readAppConfig } from './lib/githubApp'
import { failure } from './lib/http'
import { handleSuggest } from './lib/suggestApi'
import { createTheoryRepo } from './lib/theoryRepo'

/**
 * `POST /.netlify/functions/suggest-change`: turns a contributor's edited map into a pull
 * request on the theory repo, under the suggestion bot's identity (a GitHub App). The App's id,
 * installation id and private key are read from the environment only; when they are not set the
 * function answers 503 "not switched on" and does nothing else. The rules live in
 * `lib/suggestApi.ts`.
 *
 * The body and the error message are never logged (the body holds a person's name and words;
 * the message can name a GitHub step); only the kind of failure is.
 */
export default async function suggestChange(request: Request, context: Context) {
  try {
    const config = readAppConfig(process.env)
    return await handleSuggest(request, {
      kv: blobsKv('suggest-limits'),
      ip: context.ip,
      now: () => new Date(),
      repo: config ? createTheoryRepo(config) : null,
    })
  } catch (error) {
    console.error(
      `suggest-change: ${request.method} failed (${error instanceof Error ? error.name : typeof error})`,
    )
    return failure(500, 'Something went wrong, try again')
  }
}
