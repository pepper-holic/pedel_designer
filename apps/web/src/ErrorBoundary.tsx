import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
};

type State = {
  error: Error | null;
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled error in Pedal Designer UI:", error, info.componentStack);
  }

  handleReload = () => {
    this.setState({ error: null });
    window.location.reload();
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div className="error-boundary">
        <h1>문제가 발생했습니다</h1>
        <p>
          예상치 못한 오류로 화면을 표시할 수 없습니다. 회로 데이터는 브라우저에
          자동 저장되어 있으니 새로고침해도 사라지지 않습니다.
        </p>
        <pre>{this.state.error.message}</pre>
        <button type="button" onClick={this.handleReload}>
          새로고침
        </button>
      </div>
    );
  }
}
