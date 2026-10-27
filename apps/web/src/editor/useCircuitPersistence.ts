import { useEffect } from "react";
import { saveCircuitToStorage, type StoredCircuit } from "./circuitStorage";
import { circuitToFileText, parseCircuitFile } from "./circuitFile";

const AUTOSAVE_DEBOUNCE_MS = 400;

interface CircuitPersistenceOptions {
  /** The circuit as it should be written - rebuilt by the caller every render. */
  circuit: StoredCircuit;
  onLoaded: (circuit: StoredCircuit, fileName: string) => void;
  onStatus: (message: string) => void;
}

/** localStorage autosave plus explicit .json save/open. The autosave is debounced so a drag does
 * not serialize the whole circuit on every mouse move. */
export function useCircuitPersistence({ circuit, onLoaded, onStatus }: CircuitPersistenceOptions) {
  const serialized = JSON.stringify(circuit);

  useEffect(() => {
    const timer = setTimeout(() => {
      saveCircuitToStorage(localStorage, JSON.parse(serialized) as StoredCircuit);
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [serialized]);

  const saveFile = () => {
    const text = circuitToFileText(circuit);
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `pedal-designer-circuit-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    onStatus("회로를 파일로 저장했습니다.");
  };

  const openFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be picked again after a failed attempt
    if (!file) return;
    const { circuit: loaded, error } = parseCircuitFile(await file.text());
    if (!loaded) {
      onStatus(`불러오기 실패: ${error}`);
      return;
    }
    onLoaded(loaded, file.name);
  };

  return { saveFile, openFile };
}
