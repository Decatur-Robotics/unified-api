# NPM Package Template

To get started, use this repo as a template and do the following:

- Update the details in package.json
- Update the assignees in .github/dependabot.yml
- Add your NPM_TOKEN to the repository secrets (needed to publish to NPM)
- Add your GIT_PUSH_TOKEN to the repository secrets (needed to auto-increment the version number)

Branch protection is set up for the main branch, requiring you to PR into main, have at least one review, and pass CI checks. Creating a PR will also automatically increment the patch number.

Comes with ESLint, Prettier, and Jest set up. To run tests, use `npm test`. To run linting, use `npm run lint`. To run prettier, use `npm run format`.

Commits to main are automatically published to NPM (provided your CI checks pass and you've changed the package name).

NPM Package Template © 2024 by Decatur Robotics is licensed under the MIT license.
