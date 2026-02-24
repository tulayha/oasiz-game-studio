declare module "*.svg?url" {
  const url: string;
  export default url;
}

declare module "*.svg?raw" {
  const content: string;
  export default content;
}

declare module "*.wav?url" {
  const url: string;
  export default url;
}

declare module "*.mp3?url" {
  const url: string;
  export default url;
}
