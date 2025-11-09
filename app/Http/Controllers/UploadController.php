<?php

namespace App\Http\Controllers;

use App\Jobs\ProcessCsvUpload;
use App\Models\Upload;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class UploadController extends Controller
{
    public function index()
    {
        return view('uploads.index');
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'file' => 'required|file|mimes:csv,txt|max:102400', // 100 MB
        ]);

        $file = $validated['file'];
        $originalName = $file->getClientOriginalName();
        $storedName = now()->format('YmdHisv') . '_' . Str::slug(pathinfo($originalName, PATHINFO_FILENAME));
        $storedName .= '.' . $file->getClientOriginalExtension();

        $path = $file->storeAs('uploads', $storedName);

        $upload = Upload::create([
            'original_filename' => $originalName,
            'stored_filename' => $storedName,
            'status' => 'pending',
        ]);

        ProcessCsvUpload::dispatch($upload->id, $path, $originalName);

        return response()->json([
            'upload_id' => $upload->id,
        ]);
    }

    public function list(): JsonResponse
    {
        $uploads = Upload::query()
            ->orderByDesc('created_at')
            ->get([
                'id',
                'original_filename',
                'status',
                'total_rows',
                'processed_rows',
                'failure_reason',
                'created_at',
                'updated_at',
                'completed_at',
            ]);

        return response()->json([
            'uploads' => $uploads,
        ]);
    }
}

