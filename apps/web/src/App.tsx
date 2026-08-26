import "./App.css";
import { SchematicEditor } from "./editor/SchematicEditor";

function App() {
  return (
    <div className="workbench">
      <header className="menubar">
        <span className="brand">
          <span className="mark" />
          PEDAL DESIGNER
        </span>
        <div className="spacer" />
        <span className="proj">기타 이펙트 회로 시뮬레이터</span>
      </header>

      <div className="workspace-content">
        <SchematicEditor />
      </div>

      <footer className="statusbar">
        <span className="stat">
          <span className="dot" />
          준비됨
        </span>
        <div className="spacer" />
        <span className="stat">Pedal Designer v0.1</span>
      </footer>
    </div>
  );
}

export default App;
