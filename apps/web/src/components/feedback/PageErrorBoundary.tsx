import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
  errorMessage: string | null;
};

export class PageErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    errorMessage: null,
  };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error.message || "Unknown rendering error",
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("Page rendering failed", error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, errorMessage: null });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <section className="rounded-xl border border-rose-200 bg-rose-50/80 p-4 text-rose-900">
        <h2 className="text-base font-semibold">ページの表示中にエラーが発生しました</h2>
        {this.state.errorMessage ? (
          <p className="mt-2 text-sm">{this.state.errorMessage}</p>
        ) : null}
        <div className="mt-3">
          <Button type="button" onClick={this.handleRetry}>
            Retry
          </Button>
        </div>
      </section>
    );
  }
}
