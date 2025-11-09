<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Upload extends Model
{
    use HasFactory;

    protected $fillable = [
        'original_filename',
        'stored_filename',
        'status',
        'total_rows',
        'processed_rows',
        'failure_reason',
        'completed_at',
    ];

    protected $casts = [
        'completed_at' => 'datetime',
    ];

    public function markProcessing(): void
    {
        $this->update([
            'status' => 'processing',
            'failure_reason' => null,
        ]);
    }

    public function markFailed(string $message): void
    {
        $this->update([
            'status' => 'failed',
            'failure_reason' => $message,
        ]);
    }

    public function markCompleted(int $processedRows, int $totalRows): void
    {
        $this->update([
            'status' => 'completed',
            'processed_rows' => $processedRows,
            'total_rows' => $totalRows,
            'failure_reason' => null,
            'completed_at' => now(),
        ]);
    }
}

