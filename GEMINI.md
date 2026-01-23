# Project: JSAppLib

## General Instructions

- Re-read this file when it is updated.
- Follow the existing coding style when generating new Javascript.
- Add JSDoc comments for all new functions and classes. Add JSDoc comments to all public functions and classes not currently possessing them.
- Make use of the cfprotected node module to add support for protected members when creating classes.
- Always provide a static private member named "spvt" for the class-private member container.
- Always provide a private member named "pvt" for the instance-private member container.
- TypeScript is not allowed in this project.
- Tests use the jest node module.
- Don't try to guess about what I want you to do. If there is any uncertainty, ask me.
- Don't run anything on the command line without my review and approval.
- Don't assume. Question the user.

## Coding Style

- Functions can only have a single exit point. This doesn't include exceptions.
- Each new HTML Custom Element classes must be contained in its own file.
- The name of a class's file must be the class name prefixed by 'js' and have an extension of '.mjs'.
- Indentation is always 4 spaces.
- Never use public fields. If a public field is desired, use a public accessor to a private field.
- When a class uses private members, make sure to use `saveSelf(this, '$');` in the constructor, and if needed, in the static initializer block of the class.
- Except in the class constructor and in the static initializer block, private fields must be accessed via `this.$` to protect against proxy access.
