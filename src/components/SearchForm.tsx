'use client';

import { useState, type FormEvent } from 'react';
import { Spinner } from './LoadingSpinner';
import type { SearchRequest } from '@/types';

const BOROUGHS = [
  { value: 'MANHATTAN',     label: 'Manhattan'     },
  { value: 'BRONX',         label: 'Bronx'         },
  { value: 'BROOKLYN',      label: 'Brooklyn'      },
  { value: 'QUEENS',        label: 'Queens'        },
  { value: 'STATEN ISLAND', label: 'Staten Island' },
];

// Sample addresses to help users test quickly
const SAMPLE_ADDRESSES = [
  { houseNumber: '350', streetName: 'Fifth Avenue', borough: 'MANHATTAN', label: 'Empire State Building' },
  { houseNumber: '1',   streetName: 'World Trade Center', borough: 'MANHATTAN', label: 'One WTC' },
  { houseNumber: '30',  streetName: 'Hudson Yards', borough: 'MANHATTAN', label: 'Hudson Yards' },
];

interface SearchFormProps {
  onSearch:  (req: SearchRequest) => Promise<void>;
  isLoading: boolean;
}

export function SearchForm({ onSearch, isLoading }: SearchFormProps) {
  const [houseNumber, setHouseNumber] = useState('');
  const [streetName,  setStreetName]  = useState('');
  const [borough,     setBorough]     = useState('MANHATTAN');
  const [liveVerify,  setLiveVerify]  = useState(false);
  const [errors,      setErrors]      = useState<Record<string, string>>({});

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!houseNumber.trim()) errs.houseNumber = 'Required';
    if (!streetName.trim())  errs.streetName  = 'Required';
    if (!borough)            errs.borough     = 'Required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate() || isLoading) return;
    onSearch({ houseNumber: houseNumber.trim(), streetName: streetName.trim(), borough, liveVerify });
  }

  function fillSample(s: typeof SAMPLE_ADDRESSES[0]) {
    setHouseNumber(s.houseNumber);
    setStreetName(s.streetName);
    setBorough(s.borough);
    setErrors({});
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#003087] to-[#1a4da8] px-6 py-5">
          <h2 className="text-white font-semibold text-lg" style={{ fontFamily: 'var(--font-display)' }}>
            DOB Portal Search
          </h2>
          <p className="text-blue-200 text-sm mt-0.5">
            Search NYC DOB NOW Portal for filing records and ACP-5 Control Numbers
          </p>
        </div>

        <div className="px-6 pt-5 pb-4">
          {/* Address fields */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            {/* House Number */}
            <div className="md:col-span-2">
              <label className="form-label" htmlFor="houseNumber">House #</label>
              <input
                id="houseNumber"
                type="text"
                value={houseNumber}
                onChange={e => { setHouseNumber(e.target.value); setErrors(p => ({ ...p, houseNumber: '' })); }}
                placeholder="350"
                className={`form-input ${errors.houseNumber ? 'error' : ''}`}
                disabled={isLoading}
                autoComplete="off"
              />
              {errors.houseNumber && (
                <p className="text-red-500 text-xs mt-1">{errors.houseNumber}</p>
              )}
            </div>

            {/* Street Name */}
            <div className="md:col-span-6">
              <label className="form-label" htmlFor="streetName">Street Name</label>
              <input
                id="streetName"
                type="text"
                value={streetName}
                onChange={e => { setStreetName(e.target.value); setErrors(p => ({ ...p, streetName: '' })); }}
                placeholder="Fifth Avenue"
                className={`form-input ${errors.streetName ? 'error' : ''}`}
                disabled={isLoading}
                autoComplete="off"
              />
              {errors.streetName && (
                <p className="text-red-500 text-xs mt-1">{errors.streetName}</p>
              )}
            </div>

            {/* Borough */}
            <div className="md:col-span-4">
              <label className="form-label" htmlFor="borough">Borough</label>
              <select
                id="borough"
                value={borough}
                onChange={e => { setBorough(e.target.value); setErrors(p => ({ ...p, borough: '' })); }}
                className={`form-select ${errors.borough ? 'error' : ''}`}
                disabled={isLoading}
              >
                {BOROUGHS.map(b => (
                  <option key={b.value} value={b.value}>{b.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Submit button */}
          <div className="mt-4 flex items-center justify-between flex-wrap gap-3">
            <div className="text-xs text-gray-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                Scraping DOB NOW Portal in real-time
              </span>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary min-w-[160px]"
            >
              {isLoading ? (
                <>
                  <Spinner size="sm" color="white" />
                  Scraping DOB Portal…
                </>
              ) : (
                <>
                  <span>⌕</span>
                  Search DOB Portal
                </>
              )}
            </button>
          </div>
        </div>

        {/* Sample addresses */}
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400 font-medium">Try:</span>
          {SAMPLE_ADDRESSES.map(s => (
            <button
              key={s.label}
              type="button"
              onClick={() => fillSample(s)}
              disabled={isLoading}
              className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline disabled:opacity-40 transition-colors"
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </form>
  );
}
