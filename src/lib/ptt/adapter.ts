// Repo-local compatibility shim. Removed after the UI migrates to PttzzzClient.
export * from "../../../packages/browser/src/internal/terminalDriver";
export {
  createTerminalDriver as createPttAdapter,
} from "../../../packages/browser/src/internal/terminalDriver";
export type {
  TerminalDriver as PttAdapter,
} from "../../../packages/browser/src/internal/terminalDriver";
