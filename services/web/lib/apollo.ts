'use client';

import { ApolloClient, ApolloLink, HttpLink, InMemoryCache } from '@apollo/client';

import { getToken } from './auth';

const httpLink = new HttpLink({
  uri: `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/api/graphql`,
  fetchOptions: { cache: 'no-store' },
});

const authLink = new ApolloLink((operation, forward) => {
  const token = getToken();
  operation.setContext(({ headers = {} }) => ({
    headers: {
      ...headers,
      authorization: token ? `Bearer ${token}` : '',
    },
  }));
  return forward(operation);
});

export const apolloClient = new ApolloClient({
  link: authLink.concat(httpLink),
  cache: new InMemoryCache(),
  defaultOptions: {
    watchQuery: { fetchPolicy: 'network-only' },
    query: { fetchPolicy: 'network-only' },
  },
});
