import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, Plus, X } from 'lucide-react';
import { useFinanceDB, getActiveUserData } from '../context/FinanceContext';
import { apiClient } from '../api/client';

export const Groups: React.FC = () => {
  const { db, updateDB } = useFinanceDB();
  const activeData = getActiveUserData(db);
  const [isCreating, setIsCreating] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupMembers, setNewGroupMembers] = useState<string[]>(['']);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!activeData) return null;
  const { user, groups, group_members } = activeData;

  const handleAddMemberField = () => setNewGroupMembers([...newGroupMembers, '']);
  const handleUpdateMember = (index: number, val: string) => {
    const next = [...newGroupMembers];
    next[index] = val;
    setNewGroupMembers(next);
  };
  const handleRemoveMember = (index: number) => {
    const next = [...newGroupMembers];
    next.splice(index, 1);
    setNewGroupMembers(next);
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName) return;
    setIsSubmitting(true);

    try {
      const groupId = 'grp_' + Date.now();
      const groupData = {
        id: groupId,
        user_id: user.id,
        name: newGroupName,
        created_at: new Date().toISOString()
      };

      await apiClient.post('/groups/', groupData);
      
      const createdMembers: any[] = [];
      // Always add the creator as a member
      const allMembers = [user.username.split(' ')[0], ...newGroupMembers.filter(n => n.trim() !== '')];
      const uniqueMembers = Array.from(new Set(allMembers));

      for (const name of uniqueMembers) {
        const memberId = 'mem_' + Date.now() + Math.random().toString(36).substring(7);
        const memberData = {
          id: memberId,
          group_id: groupId,
          name,
          user_id: name === user.username.split(' ')[0] ? user.id : null
        };
        await apiClient.post(`/groups/${groupId}/members`, memberData);
        createdMembers.push(memberData);
      }

      updateDB(prev => ({
        ...prev,
        groups: [...prev.groups, groupData],
        group_members: [...prev.group_members, ...createdMembers]
      }));

      setIsCreating(false);
      setNewGroupName('');
      setNewGroupMembers(['']);
    } catch (err) {
      console.error('Failed to create group', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen p-6 py-8 max-w-[1000px] mx-auto animate-fade-in-up">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-section font-serif tracking-tight mb-2">Groups & Split</h1>
          <p className="text-sm text-muted">Manage shared expenses and settlements.</p>
        </div>
        <button
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-2 bg-ink text-paper px-4 py-2 rounded-xl font-medium text-sm hover:shadow-lg transition-all"
        >
          <Plus className="w-4 h-4" /> Create Group
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {groups.map(group => {
          const members = group_members.filter(m => m.group_id === group.id);
          return (
            <Link key={group.id} to={`/groups/${group.id}`} className="block group">
              <div className="bg-surface border border-line rounded-3xl p-6 shadow-sm hover:border-ink/30 hover:shadow-md transition-all">
                <div className="flex justify-between items-start mb-4">
                  <div className="w-12 h-12 bg-paper border border-line rounded-xl flex items-center justify-center group-hover:bg-ink group-hover:text-paper group-hover:border-ink transition-colors">
                    <Users className="w-6 h-6" />
                  </div>
                  <span className="text-[10px] font-mono text-muted">{new Date(group.created_at).toLocaleDateString()}</span>
                </div>
                <h3 className="font-serif text-xl mb-1">{group.name}</h3>
                <p className="text-sm text-muted line-clamp-1">
                  {members.map(m => m.name).join(', ')}
                </p>
              </div>
            </Link>
          );
        })}

        {groups.length === 0 && (
          <div className="col-span-full py-16 text-center border border-dashed border-line rounded-3xl bg-surface/50">
            <Users className="w-12 h-12 text-muted mx-auto mb-4 opacity-50" />
            <h3 className="font-serif text-xl mb-2">No Groups Yet</h3>
            <p className="text-sm text-muted max-w-sm mx-auto">Create a group to start splitting bills and tracking shared expenses.</p>
          </div>
        )}
      </div>

      {isCreating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-paper/80 backdrop-blur-sm">
          <div className="bg-surface border border-line rounded-3xl p-8 max-w-md w-full shadow-2xl relative">
            <button onClick={() => setIsCreating(false)} className="absolute top-6 right-6 text-muted hover:text-ink">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-2xl font-serif mb-6">New Group</h2>
            <form onSubmit={handleCreateGroup} className="flex flex-col gap-4">
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-semibold text-muted mb-2">Group Name</label>
                <input
                  autoFocus
                  required
                  placeholder="e.g. Trip to Goa"
                  value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                  className="w-full bg-paper border border-line rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-ink"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest font-semibold text-muted mb-2">Members (Optional)</label>
                <div className="flex flex-col gap-3 mb-3">
                  {newGroupMembers.map((member, idx) => (
                    <div key={idx} className="flex gap-2">
                      <input
                        placeholder={`Member ${idx + 1}`}
                        value={member}
                        onChange={e => handleUpdateMember(idx, e.target.value)}
                        className="flex-1 bg-paper border border-line rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-ink"
                      />
                      {newGroupMembers.length > 1 && (
                        <button type="button" onClick={() => handleRemoveMember(idx)} className="text-muted hover:text-danger px-2">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button type="button" onClick={handleAddMemberField} className="text-xs font-medium text-ink hover:underline">
                  + Add another member
                </button>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-4 w-full bg-ink text-paper py-3 rounded-xl font-medium hover:shadow-lg disabled:opacity-50"
              >
                {isSubmitting ? 'Creating...' : 'Create Group'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
