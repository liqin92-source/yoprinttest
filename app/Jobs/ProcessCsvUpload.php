<?php

namespace App\Jobs;

use App\Models\Product;
use App\Models\Upload;
use Exception;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

class ProcessCsvUpload implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public int $tries = 1;

    private int $uploadId;

    private string $path;

    private string $originalName;

    public function __construct(int $uploadId, string $path, string $originalName)
    {
        $this->uploadId = $uploadId;
        $this->path = $path;
        $this->originalName = $originalName;
    }

    public function handle(): void
    {
        $upload = Upload::findOrFail($this->uploadId);
        $upload->markProcessing();
        $upload->update([
            'total_rows' => 0,
            'processed_rows' => 0,
        ]);

        $fullPath = Storage::path($this->path);

        if (! file_exists($fullPath)) {
            throw new Exception("Uploaded file not found: {$fullPath}");
        }

        $handle = fopen($fullPath, 'rb');
        if (! $handle) {
            throw new Exception("Unable to open file {$fullPath}");
        }

        try {
            $header = null;
            $total = 0;
            $processed = 0;

            while (($row = fgetcsv($handle)) !== false) {
                if ($header === null) {
                    $header = $this->normalizeHeader($row);
                    continue;
                }

                $record = $this->mapRow($header, $row);
                if (! $record) {
                    continue;
                }

                $total++;
                $processed += $this->upsertProduct($record) ? 1 : 0;

                if ($total % 25 === 0) {
                    $upload->update([
                        'total_rows' => $total,
                        'processed_rows' => $processed,
                    ]);
                }
            }

            $upload->markCompleted($processed, $total);
        } catch (Exception $exception) {
            $upload->markFailed($exception->getMessage());
            Log::error('CSV processing failed', [
                'upload_id' => $this->uploadId,
                'file' => $this->originalName,
                'error' => $exception->getMessage(),
            ]);
            throw $exception;
        } finally {
            fclose($handle);
        }
    }

    private function normalizeHeader(array $row): array
    {
        return array_map(function ($value) {
            $normalized = strtolower(trim((string) $value));
            $normalized = str_replace(['#', ' '], ['_number', '_'], $normalized);

            return $normalized;
        }, $row);
    }

    private function mapRow(array $header, array $row): ?array
    {
        if (count($row) !== count($header)) {
            return null;
        }

        $data = [];
        foreach ($header as $index => $key) {
            $data[$key] = $this->sanitizeValue($row[$index] ?? '');
        }

        $uniqueKey = $data['unique_key'] ?? null;
        if (! $uniqueKey) {
            return null;
        }

        return [
            'unique_key' => $uniqueKey,
            'product_title' => $data['product_title'] ?? null,
            'product_description' => $data['product_description'] ?? null,
            'style_number' => $data['style_number'] ?? ($data['style__number'] ?? null),
            'sanmar_mainframe_color' => $data['sanmar_mainframe_color'] ?? null,
            'size' => $data['size'] ?? null,
            'color_name' => $data['color_name'] ?? null,
            'piece_price' => $this->normalizePrice($data['piece_price'] ?? null),
        ];
    }

    private function sanitizeValue(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $value = trim($value);
        if ($value === '') {
            return null;
        }

        $converted = $value;
        if (function_exists('mb_convert_encoding')) {
            $converted = mb_convert_encoding($converted, 'UTF-8', 'UTF-8');
        } elseif (function_exists('iconv')) {
            $converted = iconv('UTF-8', 'UTF-8//IGNORE', $converted);
        }

        $converted = preg_replace('/[^\x09\x0A\x0D\x20-\x7E\xA0-\x{10FFFF}]/u', '', $converted);

        return $converted;
    }

    private function normalizePrice(?string $value): ?float
    {
        if ($value === null || $value === '') {
            return null;
        }

        $normalized = preg_replace('/[^0-9.\\-]/', '', $value);

        return $normalized !== '' ? (float) $normalized : null;
    }

    private function upsertProduct(array $record): bool
    {
        Product::updateOrCreate(
            ['unique_key' => $record['unique_key']],
            [
                'product_title' => $record['product_title'],
                'product_description' => $record['product_description'],
                'style_number' => $record['style_number'],
                'sanmar_mainframe_color' => $record['sanmar_mainframe_color'],
                'size' => $record['size'],
                'color_name' => $record['color_name'],
                'piece_price' => $record['piece_price'],
            ],
        );

        return true;
    }
}

