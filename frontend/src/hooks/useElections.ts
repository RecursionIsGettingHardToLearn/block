import { useState, useEffect, useCallback } from 'react';
import api from '../api/axios.config';
import type { Election, ElectionStatus, Candidate } from '../types';

export function useElections() {
  const [elections, setElections] = useState<Election[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchElections = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<Election[]>('/elections');
      setElections(data);
    } catch {
      setError('Error al cargar elecciones');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchElections();
  }, [fetchElections]);

  async function createElection(payload: {
    title: string;
    description?: string;
    startDate: string;
    endDate: string;
    channelName?: string;
  }): Promise<Election> {
    const { data } = await api.post<Election>('/elections', payload);
    setElections((prev) => [...prev, data]);
    return data;
  }

  async function updateStatus(
    id: string,
    status: ElectionStatus,
  ): Promise<void> {
    const { data } = await api.patch<Election>(`/elections/${id}/status`, {
      status,
    });
    setElections((prev) => prev.map((e) => (e.id === id ? data : e)));
  }

  async function deleteElection(id: string): Promise<void> {
    await api.delete(`/elections/${id}`);
    setElections((prev) => prev.filter((e) => e.id !== id));
  }

  async function addCandidate(
    electionId: string,
    payload: Omit<Candidate, 'id'>,
  ): Promise<void> {
    await api.post(`/elections/${electionId}/candidates`, {
      electionId,
      ...payload,
    });
    await fetchElections();
  }

  async function removeCandidate(
    electionId: string,
    candidateId: string,
  ): Promise<void> {
    await api.delete(`/elections/${electionId}/candidates/${candidateId}`);
    await fetchElections();
  }

  return {
    elections,
    loading,
    error,
    fetchElections,
    createElection,
    updateStatus,
    deleteElection,
    addCandidate,
    removeCandidate,
  };
}
