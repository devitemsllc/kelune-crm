import React from 'react';
import { Button } from 'antd';
import { __ } from '@wordpress/i18n';
import ErrorState from './ErrorState';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Catches render-time errors anywhere in the page tree and shows a 500 result
 * instead of an unmounted (blank) app. HashRouter has no data-router
 * errorElement, so this class boundary is how runtime errors are handled.
 */
class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Kelune CRM dashboard error:', error, info);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <ErrorState
          status="500"
          title="500"
          subTitle={__('Sorry, something went wrong.', 'kelune-crm')}
          extra={
            <Button type="primary" onClick={this.handleReload}>
              {__('Reload', 'kelune-crm')}
            </Button>
          }
        />
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
