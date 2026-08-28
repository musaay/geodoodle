package main

import (
	"compress/gzip"
	"log"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"
)

// Vite emits hashed filenames under /assets, so those can be cached forever.
// Everything else (index.html, sw.js, manifest) must revalidate so deploys
// reach users immediately.
func cacheHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/assets/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		} else {
			w.Header().Set("Cache-Control", "no-cache")
		}
		next.ServeHTTP(w, r)
	})
}

var compressibleExts = map[string]bool{
	".html": true, ".js": true, ".css": true, ".svg": true,
	".json": true, ".txt": true, ".webmanifest": true,
}

func isCompressible(p string) bool {
	if p == "/" || strings.HasSuffix(p, "/") {
		return true
	}
	return compressibleExts[strings.ToLower(path.Ext(p))]
}

type gzipResponseWriter struct {
	http.ResponseWriter
	gz *gzip.Writer
}

func (w *gzipResponseWriter) WriteHeader(code int) {
	// Content-Length would describe the uncompressed size; drop it.
	w.Header().Del("Content-Length")
	w.ResponseWriter.WriteHeader(code)
}

func (w *gzipResponseWriter) Write(b []byte) (int, error) {
	return w.gz.Write(b)
}

func gzipMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") ||
			r.Header.Get("Range") != "" ||
			!isCompressible(r.URL.Path) {
			next.ServeHTTP(w, r)
			return
		}
		w.Header().Set("Content-Encoding", "gzip")
		w.Header().Add("Vary", "Accept-Encoding")
		gz := gzip.NewWriter(w)
		defer gz.Close()
		next.ServeHTTP(&gzipResponseWriter{ResponseWriter: w, gz: gz}, r)
	})
}

// noDirListing blocks http.FileServer's directory index pages (e.g. /assets/),
// while still allowing directories that hold a real index.html — such as the
// generated /bolge/<id>/ and /gizlilik/ SEO pages — to serve normally.
func noDirListing(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" && strings.HasSuffix(r.URL.Path, "/") {
			indexPath := filepath.Join("dist", filepath.Clean(r.URL.Path), "index.html")
			if _, err := os.Stat(indexPath); err != nil {
				http.NotFound(w, r)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func main() {
	// Railway provides PORT environment variable
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// Serve the "dist" directory
	fs := http.FileServer(http.Dir("./dist"))

	mux := http.NewServeMux()
	mux.Handle("/", noDirListing(cacheHeaders(gzipMiddleware(fs))))

	// Configure server with explicit timeouts to prevent Goroutine/memory leaks
	// from stale keep-alive connections (especially behind load balancers like Railway)
	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      mux,
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	log.Printf("Starting static file server on port %s...", port)
	err := srv.ListenAndServe()
	if err != nil {
		log.Fatal("Server failed: ", err)
	}
}
