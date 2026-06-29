// Ambient declarations so the TS editor/language-server doesn't flag CSS and
// other asset imports. (next build already handles these at compile time — this
// just silences the editor "Cannot find module './globals.css'" warning.)
declare module "*.css";
declare module "*.scss";
