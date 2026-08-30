# Fast Narrate

Fast Narrate turns an English story summary into a long-form Hindi manga story.

AI credentials are stored as encrypted server-side secrets and are never committed to this repository. The writer uses ParalonCloud's free 27B Qwen model, distributes chapter work across the configured keys, and shares one story plan across every chapter for consistency.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://fast-narrate.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/c579b4da-f5ec-41be-ac0a-7b31ab2571ec).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
