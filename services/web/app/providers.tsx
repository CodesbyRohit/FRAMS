'use client';

import { ApolloProvider } from '@apollo/client';

import { apolloClient } from '@/lib/apollo';

/** Explicit client boundary for all app providers (Apollo, theme, ...). */
export function Providers({ children }: { children: React.ReactNode }) {
  return <ApolloProvider client={apolloClient}>{children}</ApolloProvider>;
}
