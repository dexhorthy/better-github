
Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

<important if="you are interacting with agentmail">

You have access to AgentMail — an Email API for Agents.
The llms.txt file is a very good starting point. Read it first, then go from there based on what the user needs.

llms.txt (overview + all doc links): https://docs.agentmail.to/llms.txt
llms-full.txt (complete reference with inline code examples): https://docs.agentmail.to/llms-full.txt

</important>
