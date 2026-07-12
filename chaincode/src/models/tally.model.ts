export interface TallyAsset {
  assetType: 'tally';
  electionId: string;
  results: Record<string, number>; // candidateId → vote count; also votos_blancos, votos_nulos
  lastUpdated: string; // ISO 8601
}
