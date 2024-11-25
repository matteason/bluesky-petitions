# Bluesky petitions bot

This is a bot for [Bluesky](https://bsky.social) which posts updates on petitions from the [UK Government and Parliament petitions](https://petition.parliament.uk/) website.

## Setting up

- Create an account on [Bluesky](https://bsky.social) to use for the bot
- Copy `.env.example` to `.env`
- In `.env`, enter the handle (username) of the account to use for the bot, without the @ (eg `petitions.bsky.social`), and a password. I strongly suggest you create an [app password](https://bsky.app/settings/app-passwords) for this rather than using the account's main password.

## Running the bot

```sh
npm run processPetitions
```