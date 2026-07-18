import './globals.css';
import React from 'react';

export const metadata = { title: 'MiniChat', description: 'Real-time chat application' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (<html lang="en"><body>{children}</body></html>);
}
