import './globals.css';
export const metadata = { title: 'MiniChat', description: 'Real-time chat application' };
export default function RootLayout({ children }) {
    return (<html lang="en"><body>{children}</body></html>);
}
