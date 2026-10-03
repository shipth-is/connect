/// <reference types="vite/client" />

interface ImportMetaEnv {
  // The git commit this page was built from. Set by the Dockerfile from the COMMIT build arg.
  readonly VITE_COMMIT?: string
}
