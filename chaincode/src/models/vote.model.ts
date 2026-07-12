export interface VoteAsset {
  assetType: 'vote';
  id: string; // anonymous voteId (uuidv4 from NestJS — never contains RU)
  electionId: string;
  candidateId: string;
  timestamp: string; // ISO 8601
  txId: string; // Fabric transaction ID (ctx.stub.getTxID())
}
