# Independent archive fixture

`independent.7z` was created with **py7zr 1.0.0**, not Aster or its emulated 7-Zip.
It contains `independent.txt` with exactly these UTF-8/ASCII bytes:

```text
Independent archive created by py7zr
```

There is one final LF. Generation used `py7zr.SevenZipFile(..., 'w', filters=[{'id': py7zr.FILTER_LZMA2, 'dict_size': 1048576}])` and added the file as `independent.txt`.
The tiny original text is MIT-licensed with Aster. This fixture prevents a
self-consistent broken archiver from passing only its own create/extract test.
Native Windows CI additionally validates artifacts created by Aster's emulated
upstream 7-Zip, comparing all extracted bytes to the original text/binary inputs.
