import { Button } from "antd";
import { Component, type ErrorInfo, type ReactNode } from "react";

import LoadingState from "./LoadingState";

type PageErrorBoundaryProps = {
  children: ReactNode;
  resetKey: string;
};

type PageErrorBoundaryState = {
  error: Error | null;
};

export default class PageErrorBoundary extends Component<
  PageErrorBoundaryProps,
  PageErrorBoundaryState
> {
  state: PageErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): PageErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Page render failed", error, errorInfo);
  }

  componentDidUpdate(previousProps: PageErrorBoundaryProps) {
    if (
      this.state.error &&
      previousProps.resetKey !== this.props.resetKey
    ) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <LoadingState
          title="Something went sideways"
          detail="Reload the page to set the table back up."
          isError
          showSpinner={false}
        >
          <Button
            size="large"
            type="primary"
            onClick={() => window.location.reload()}
          >
            Reload page
          </Button>
        </LoadingState>
      );
    }

    return this.props.children;
  }
}
