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

      <p className="mobile-notice">
        이 앱은 마우스·키보드가 있는 넓은 화면(데스크톱)에서 사용하도록 만들어졌습니다. 회로 배선(단자
        클릭)과 확대/축소(마우스 휠)는 터치만으로 조작하기 어려울 수 있습니다.
      </p>

      <SchematicEditor />

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
