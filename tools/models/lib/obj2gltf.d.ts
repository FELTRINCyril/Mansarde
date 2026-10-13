declare module 'obj2gltf' {
  export default function obj2gltf(path: string, options: { binary: true; secure?: boolean }): Promise<Buffer>;
}
