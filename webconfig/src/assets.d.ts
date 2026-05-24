declare module "*.css?raw" {
  const content: string;
  export default content;
}

declare module "*.png?url" {
  const content: string;
  export default content;
}

declare module "*.css" {
  const content: undefined;
  export default content;
}
