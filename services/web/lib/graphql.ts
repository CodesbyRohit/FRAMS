import { gql } from '@apollo/client';

/**
 * Central GraphQL operations. Kept as a single typed document so the client
 * layer is auditable and the server schema is the source of truth.
 */

export const ONBOARD = gql`
  mutation Onboard($email: String!, $displayName: String!, $roles: [String!]) {
    onboard(email: $email, displayName: $displayName, roles: $roles) {
      id
      email
      displayName
      roles
    }
  }
`;

export const PASSKEY_REGISTRATION_OPTIONS = gql`
  query PasskeyRegistrationOptions($personId: String!) {
    passkeyRegistrationOptions(personId: $personId)
  }
`;

export const REGISTER_PASSKEY = gql`
  mutation RegisterPasskey($personId: String!, $deviceName: String, $attestation: String!) {
    registerPasskey(personId: $personId, deviceName: $deviceName, attestation: $attestation) {
      token
      personId
      displayName
      verificationMethod
    }
  }
`;

export const PASSKEY_LOGIN_OPTIONS = gql`
  query PasskeyLoginOptions($email: String!) {
    passkeyLoginOptions(email: $email)
  }
`;

export const LOGIN_WITH_PASSKEY = gql`
  mutation LoginWithPasskey($email: String!, $assertion: String!) {
    loginWithPasskey(email: $email, assertion: $assertion) {
      token
      personId
      displayName
      verificationMethod
    }
  }
`;

export const LOGIN_WITH_FACE = gql`
  mutation LoginWithFace($imageBase64: String!, $deviceScore: Float, $behavioralScore: Float) {
    loginWithFace(
      imageBase64: $imageBase64
      deviceScore: $deviceScore
      behavioralScore: $behavioralScore
    ) {
      token
      personId
      displayName
      verificationConfidence
      verificationMethod
    }
  }
`;

export const ENROLL_FACE = gql`
  mutation EnrollFace($imageBase64: String!) {
    enrollFace(imageBase64: $imageBase64)
  }
`;

export const ME = gql`
  query Me {
    me {
      id
      email
      displayName
      bio
      roles
      createdAt
      twin {
        id
        version
        skills {
          name
          level
          evidenceCount
          lastObserved
        }
        goals {
          id
          title
          description
          status
          progress
          createdAt
        }
        interests
        narrative
        stats {
          memories
          documents
          projects
          interactions
          daysActive
        }
        updatedAt
      }
    }
  }
`;

export const MY_MEMORIES = gql`
  query MyMemories($limit: Int) {
    myMemories(limit: $limit) {
      id
      kind
      title
      content
      importance
      createdAt
    }
    myMemoryEvents(limit: 30) {
      id
      type
      summary
      occurredAt
    }
  }
`;

export const SEARCH_MEMORIES = gql`
  query SearchMemories($query: String!, $limit: Int) {
    searchMemories(query: $query, limit: $limit) {
      id
      kind
      title
      content
      importance
      createdAt
    }
  }
`;

export const INGEST_MEMORY = gql`
  mutation IngestMemory($type: String!, $summary: String!, $payload: String) {
    ingestMemory(type: $type, summary: $summary, payload: $payload) {
      id
      type
      summary
    }
  }
`;

export const SET_GOAL = gql`
  mutation SetGoal($title: String!, $description: String) {
    setGoal(title: $title, description: $description) {
      id
      goals {
        id
        title
        status
        progress
      }
    }
  }
`;

export const MARK_SKILL = gql`
  mutation MarkSkillLearned($name: String!) {
    markSkillLearned(name: $name) {
      skills {
        name
        level
        evidenceCount
      }
    }
  }
`;

export const ASK_COPILOT = gql`
  query AskCopilot($message: String!) {
    askCopilot(message: $message) {
      id
      role
      content
      agentId
      toolCalls {
        tool
        args
        result
        error
      }
      sources {
        label
        snippet
      }
      createdAt
    }
  }
`;

export const AGENT_CATALOG = gql`
  query AgentCatalog {
    agentCatalog {
      id
      name
      description
    }
  }
`;

export const KNOWLEDGE_GRAPH = gql`
  query KnowledgeGraph($limit: Int) {
    knowledgeGraph(limit: $limit) {
      nodes {
        id
        type
        label
        properties
      }
      edges {
        id
        source
        target
        type
      }
      generatedAt
    }
    knowledgeGraphAvailable
  }
`;

export const MY_INSIGHTS = gql`
  query MyInsights {
    myInsights {
      id
      kind
      title
      body
      confidence
      evidence {
        label
        detail
      }
      observedFacts
      createdAt
    }
  }
`;

export const MY_TRUST = gql`
  query MyTrustProfile {
    myTrustProfile {
      personId
      identityScore
      deviceScore
      behavioralScore
      boundMethods
      lastVerifiedAt
      lastVerificationMethod
    }
  }
`;

export const ASK_KNOWLEDGE = gql`
  query AskYourKnowledge($query: String!) {
    askYourKnowledge(query: $query) {
      answer
      sources {
        label
        snippet
        score
      }
      latencyMs
    }
  }
`;

export const MY_DOCUMENTS = gql`
  query MyDocuments {
    myDocuments {
      id
      title
      mimeType
      sizeBytes
      chunkCount
      status
      createdAt
    }
  }
`;
