import { Component } from 'react';
import { AlertTriangle } from 'lucide-react';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log error to console
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    this.setState({
      error,
      errorInfo
    });
  }

  handleRefresh = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="card max-w-lg w-full text-center">
            <div className="flex justify-center mb-4">
              <AlertTriangle className="h-16 w-16 text-red-500" aria-hidden="true" />
            </div>
            
            <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--color-text-primary)' }}>
              Oops! Something went wrong
            </h1>
            
            <p className="mb-6" style={{ color: 'var(--color-text-secondary)' }}>
              We're sorry, but something unexpected happened. Please try refreshing the page or return to the home page.
            </p>
            
            <div className="flex gap-3 justify-center">
              <button 
                onClick={this.handleRefresh}
                className="btn-primary"
                aria-label="Refresh the page"
              >
                Refresh Page
              </button>
              <button 
                onClick={this.handleGoHome}
                className="btn-secondary"
                aria-label="Go to home page"
              >
                Go to Home
              </button>
            </div>
            
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mt-6 text-left">
                <summary className="cursor-pointer text-sm font-semibold mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                  Error Details (Development Only)
                </summary>
                <div className="p-4 rounded-lg text-xs overflow-auto max-h-60" style={{ backgroundColor: 'var(--color-background-secondary)', color: 'var(--color-text-primary)' }}>
                  <p className="font-mono mb-2">{this.state.error.toString()}</p>
                  {this.state.errorInfo && (
                    <pre className="whitespace-pre-wrap">{this.state.errorInfo.componentStack}</pre>
                  )}
                </div>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
