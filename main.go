package main

import (
	"log"
	"net/http"
	"os"
)

func main() {
	// Railway provides PORT environment variable
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// Serve the "dist" directory
	fs := http.FileServer(http.Dir("./dist"))
	http.Handle("/", fs)

	log.Printf("Starting static file server on port %s...", port)
	err := http.ListenAndServe(":"+port, nil)
	if err != nil {
		log.Fatal("Server failed: ", err)
	}
}
