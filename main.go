package main

import (
	"log"
	"net/http"
	"os"
	"time"
)

func main() {
	// Railway provides PORT environment variable
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// Serve the "dist" directory
	fs := http.FileServer(http.Dir("./dist"))
	
	mux := http.NewServeMux()
	mux.Handle("/", fs)

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
