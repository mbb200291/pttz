// Repo-local compatibility shim. Removed when the UI adopts PttzzzClient in Task 17.
export {
  createLegacyFakePttAdapterForUi as createFakePttAdapter,
  FAKE_PTT_STORE_KEY,
  getFakePttCurrentUser,
  isFakePttMode,
} from "../../../packages/browser/src/internal/fakeTerminalDriver";
