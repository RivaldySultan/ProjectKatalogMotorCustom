import { Component } from 'react';

export default class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Unhandled application rendering error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="rm-container" role="alert">
          <h1>Terjadi Kesalahan pada Aplikasi</h1>
          <p>Halaman ini tidak dapat ditampilkan. Muat ulang halaman untuk mencoba kembali.</p>
          <button className="rm-button rm-button--primary" onClick={() => window.location.reload()} type="button">
            Muat Ulang
          </button>
        </main>
      );
    }

    return this.props.children;
  }
}
