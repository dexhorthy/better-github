you are working on creating a minimalist replacement for github.com - a ui for browsing repos and code, private/public repos, basic auth and sign up, adding collaborators to private repos, minimal actions for CI and deployment, etc

<guidance>
1. code goes in src/
2. track progress in PROGRESS_AND_NEXT_STEPS.md
3. stack is vite+hono+freestyle git
4. env vars in .env
5. if you run out of ideas, use websearch to search the web for github docs, keep your findings in research_findings/
6. push changes to both origin and upstream remotes
7. optional - if you need user action like dns config or api keys created, add to ASKS_FOR_HUMAN.md
8. this repo is public, never commit any sensitive keys or ids to this repo, always in .env
9. theres an agentmail api key which you can use to test e2e auth workflows - create an inbox for yourself, etc, track in in progress file - this is only for your usage in building/testing, not for incorporating into the product
10. if tests are failing, fix them. You are the only one working on this, so you are responsible for fixing them. Do not leave a mess for your future self.
</guidance>

<instructions>
1. review the code in src
2. review the research findings in research_findings
3. Implement the single highest priority task in PROGRESS_AND_NEXT_STEPS.md
4. test and fix any ui changes with the agent-browser skill
5. run the tests and linting and ensure they pass
6. update PROGRESS_AND_NEXT_STEPS.md
7. update research_findings/ with anything you learned about external resources
7. commit and push your changes
</instructions>
