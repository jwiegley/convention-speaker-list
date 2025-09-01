import React, { useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';

// Validation schema for delegate form
const delegateSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  number: z.number().min(1, 'Number must be positive').max(999, 'Number must be less than 1000'),
  country: z.string().min(2, 'Country is required'),
  gender: z.enum(['M', 'F', 'O'], {
    errorMap: () => ({ message: 'Please select a gender' })
  }),
  has_spoken: z.boolean().default(false),
});

type DelegateFormData = z.infer<typeof delegateSchema>;

interface Delegate extends DelegateFormData {
  id: string;
  created_at: string;
  updated_at: string;
  speaking_count: number;
}

import { config } from '../../utils/config';

const API_BASE_URL = config.api.baseUrl;

export function DelegateManagement() {
  const [selectedDelegates, setSelectedDelegates] = useState<Set<string>>(new Set());
  const [editingDelegate, setEditingDelegate] = useState<Delegate | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'number' | 'country'>('number');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [showImportDialog, setShowImportDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Form setup with validation
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
    setValue,
    watch,
  } = useForm<DelegateFormData>({
    resolver: zodResolver(delegateSchema),
    defaultValues: {
      has_spoken: false,
      gender: 'M',
    },
  });

  // Fetch delegates
  const { data: delegates = [], isLoading, error } = useQuery({
    queryKey: ['delegates'],
    queryFn: async () => {
      try {
        console.log('API_BASE_URL:', API_BASE_URL);
        console.log('Full URL:', `${API_BASE_URL}/delegates`);
        console.log('Window location:', window.location.origin);
        
        const response = await axios.get(`${API_BASE_URL}/delegates`);
        console.log('Delegates response:', response.data);
        return response.data;
      } catch (err: any) {
        console.error('Error fetching delegates:', err);
        console.error('Error details:', {
          message: err.message,
          code: err.code,
          response: err.response,
          request: err.request,
          config: err.config
        });
        throw err;
      }
    },
  });

  // Create delegate mutation
  const createDelegateMutation = useMutation({
    mutationFn: async (data: DelegateFormData) => {
      console.log('Creating delegate with data:', data);
      console.log('POST URL:', `${API_BASE_URL}/delegates`);
      const response = await axios.post(`${API_BASE_URL}/delegates`, data);
      console.log('Create response:', response.data);
      return response.data;
    },
    onSuccess: (data) => {
      console.log('Delegate created successfully:', data);
      queryClient.invalidateQueries({ queryKey: ['delegates'] });
      reset();
      showNotification('Delegate created successfully', 'success');
    },
    onError: (error) => {
      showNotification('Failed to create delegate', 'error');
      console.error('Create delegate error:', error);
    },
  });

  // Update delegate mutation
  const updateDelegateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: DelegateFormData }) => {
      const response = await axios.put(`${API_BASE_URL}/delegates/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delegates'] });
      setEditingDelegate(null);
      reset();
      showNotification('Delegate updated successfully', 'success');
    },
    onError: (error) => {
      showNotification('Failed to update delegate', 'error');
      console.error('Update delegate error:', error);
    },
  });

  // Delete delegate mutation
  const deleteDelegateMutation = useMutation({
    mutationFn: async (id: string) => {
      await axios.delete(`${API_BASE_URL}/delegates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delegates'] });
      setShowDeleteConfirm(null);
      showNotification('Delegate deleted successfully', 'success');
    },
    onError: (error) => {
      showNotification('Failed to delete delegate', 'error');
      console.error('Delete delegate error:', error);
    },
  });

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await axios.post(`${API_BASE_URL}/delegates/bulk-delete`, { ids });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delegates'] });
      setSelectedDelegates(new Set());
      showNotification('Delegates deleted successfully', 'success');
    },
    onError: (error) => {
      showNotification('Failed to delete delegates', 'error');
      console.error('Bulk delete error:', error);
    },
  });

  // Import CSV mutation
  const importCSVMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const response = await axios.post(`${API_BASE_URL}/delegates/import`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['delegates'] });
      setShowImportDialog(false);
      showNotification(`Imported ${data.count} delegates successfully`, 'success');
    },
    onError: (error) => {
      showNotification('Failed to import CSV', 'error');
      console.error('Import error:', error);
    },
  });

  // Notification helper
  const showNotification = (message: string, type: 'success' | 'error') => {
    // This would typically integrate with a toast library
    console.log(`[${type.toUpperCase()}]: ${message}`);
  };

  // Form submission handler
  const onSubmit = (data: DelegateFormData) => {
    if (editingDelegate) {
      updateDelegateMutation.mutate({ id: editingDelegate.id, data });
    } else {
      createDelegateMutation.mutate(data);
    }
  };

  // Edit delegate handler
  const handleEdit = (delegate: Delegate) => {
    setEditingDelegate(delegate);
    setValue('name', delegate.name);
    setValue('number', delegate.number);
    setValue('country', delegate.country);
    setValue('gender', delegate.gender);
    setValue('has_spoken', delegate.has_spoken);
  };

  // Cancel edit handler
  const handleCancelEdit = () => {
    setEditingDelegate(null);
    reset();
  };

  // Delete confirmation handler
  const handleDelete = (id: string) => {
    deleteDelegateMutation.mutate(id);
  };

  // Bulk operations handlers
  const handleSelectAll = () => {
    if (selectedDelegates.size === filteredDelegates.length) {
      setSelectedDelegates(new Set());
    } else {
      setSelectedDelegates(new Set(filteredDelegates.map((d: Delegate) => d.id)));
    }
  };

  const handleBulkDelete = () => {
    if (selectedDelegates.size > 0) {
      bulkDeleteMutation.mutate(Array.from(selectedDelegates));
    }
  };

  // File upload handler
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      importCSVMutation.mutate(file);
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'text/csv') {
      importCSVMutation.mutate(file);
    } else {
      showNotification('Please upload a CSV file', 'error');
    }
  };

  // Filter and sort delegates
  const filteredDelegates = delegates
    .filter((delegate: Delegate) => {
      const search = searchTerm.toLowerCase();
      return (
        delegate.name.toLowerCase().includes(search) ||
        delegate.country.toLowerCase().includes(search) ||
        delegate.number.toString().includes(search)
      );
    })
    .sort((a: Delegate, b: Delegate) => {
      const aValue = a[sortBy];
      const bValue = b[sortBy];
      const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      return sortOrder === 'asc' ? comparison : -comparison;
    });

  // Auto-save functionality
  const formValues = watch();
  React.useEffect(() => {
    if (isDirty && editingDelegate) {
      const autoSaveTimer = setTimeout(() => {
        // Auto-save logic could be implemented here
        console.log('Auto-saving...', formValues);
      }, 2000);
      return () => clearTimeout(autoSaveTimer);
    }
  }, [formValues, isDirty, editingDelegate]);

  return (
    <div className="delegate-management space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Delegate Management</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImportDialog(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Import CSV
          </button>
          {selectedDelegates.size > 0 && (
            <button
              onClick={handleBulkDelete}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Delete Selected ({selectedDelegates.size})
            </button>
          )}
        </div>
      </div>

      {/* Delegate Form */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-lg shadow p-6"
      >
        <h3 className="text-lg font-semibold mb-4">
          {editingDelegate ? 'Edit Delegate' : 'Add New Delegate'}
        </h3>
        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name *
            </label>
            <input
              {...register('name')}
              className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter delegate name"
            />
            {errors.name && (
              <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Number *
            </label>
            <input
              {...register('number', { valueAsNumber: true })}
              type="number"
              className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter delegate number"
            />
            {errors.number && (
              <p className="text-red-500 text-sm mt-1">{errors.number.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Country *
            </label>
            <input
              {...register('country')}
              className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter country"
            />
            {errors.country && (
              <p className="text-red-500 text-sm mt-1">{errors.country.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Gender *
            </label>
            <select
              {...register('gender')}
              className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="M">Male</option>
              <option value="F">Female</option>
              <option value="O">Other</option>
            </select>
            {errors.gender && (
              <p className="text-red-500 text-sm mt-1">{errors.gender.message}</p>
            )}
          </div>

          <div className="col-span-2">
            <label className="flex items-center">
              <input
                {...register('has_spoken')}
                type="checkbox"
                className="mr-2"
              />
              <span className="text-sm font-medium text-gray-700">
                Has spoken before
              </span>
            </label>
          </div>

          <div className="col-span-2 flex gap-2">
            <button
              type="submit"
              disabled={createDelegateMutation.isPending || updateDelegateMutation.isPending}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
            >
              {editingDelegate ? 'Update' : 'Create'} Delegate
            </button>
            {editingDelegate && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </motion.div>

      {/* Search and Filter */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex gap-4 items-center">
          <input
            type="text"
            placeholder="Search delegates..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="px-3 py-2 border rounded"
          >
            <option value="number">Sort by Number</option>
            <option value="name">Sort by Name</option>
            <option value="country">Sort by Country</option>
          </select>
          <button
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            className="px-3 py-2 border rounded hover:bg-gray-50"
          >
            {sortOrder === 'asc' ? '↑' : '↓'}
          </button>
        </div>
      </div>

      {/* Delegate List */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Delegate List</h3>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={selectedDelegates.size === filteredDelegates.length && filteredDelegates.length > 0}
                onChange={handleSelectAll}
                className="mr-2"
              />
              Select All
            </label>
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center">Loading delegates...</div>
        ) : error ? (
          <div className="p-8 text-center text-red-500">
            Error loading delegates: {error instanceof Error ? error.message : 'Unknown error'}
          </div>
        ) : filteredDelegates.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No delegates found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <input type="checkbox" className="invisible" />
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                    Number
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                    Country
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                    Gender
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                    Spoken
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                  {filteredDelegates.map((delegate: Delegate) => (
                    <motion.tr
                      key={delegate.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="border-b hover:bg-gray-50"
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedDelegates.has(delegate.id)}
                          onChange={(e) => {
                            const newSelected = new Set(selectedDelegates);
                            if (e.target.checked) {
                              newSelected.add(delegate.id);
                            } else {
                              newSelected.delete(delegate.id);
                            }
                            setSelectedDelegates(newSelected);
                          }}
                        />
                      </td>
                      <td className="px-4 py-3 text-sm">{delegate.number}</td>
                      <td className="px-4 py-3 text-sm font-medium">{delegate.name}</td>
                      <td className="px-4 py-3 text-sm">{delegate.country}</td>
                      <td className="px-4 py-3 text-sm">{delegate.gender}</td>
                      <td className="px-4 py-3 text-sm">
                        {delegate.has_spoken ? (
                          <span className="text-green-600">Yes ({delegate.speaking_count})</span>
                        ) : (
                          <span className="text-gray-400">No</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEdit(delegate)}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setShowDeleteConfirm(delegate.id)}
                            className="text-red-600 hover:text-red-800"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
            onClick={() => setShowDeleteConfirm(null)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="bg-white rounded-lg p-6 max-w-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold mb-2">Confirm Delete</h3>
              <p className="text-gray-600 mb-4">
                Are you sure you want to delete this delegate?
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowDeleteConfirm(null)}
                  className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(showDeleteConfirm)}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Import CSV Dialog */}
      <AnimatePresence>
        {showImportDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
            onClick={() => setShowImportDialog(false)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="bg-white rounded-lg p-6 max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold mb-4">Import CSV</h3>
              <div
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 transition-colors"
              >
                <p className="text-gray-600 mb-4">
                  Drag and drop a CSV file here, or click to select
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Select File
                </button>
              </div>
              <div className="mt-4 text-sm text-gray-600">
                <p>CSV Format: name, number, country, gender (M/F/O), has_spoken (true/false)</p>
              </div>
              <div className="flex gap-2 justify-end mt-4">
                <button
                  onClick={() => setShowImportDialog(false)}
                  className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}