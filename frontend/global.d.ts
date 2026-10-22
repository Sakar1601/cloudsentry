declare module "*.module.css" {
  const classes: { [key: string]: string };
  export default classes;
}

// Plain stylesheet imports (app/globals.css): TypeScript 7 requires these to resolve.
declare module "*.css";
