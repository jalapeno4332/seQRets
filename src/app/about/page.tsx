
'use client';

import React from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Shield, Lock, Key, QrCode, Github } from "lucide-react";
import Link from "next/link";
import { Header } from "../components/header";
import Image from "next/image";

export default function AboutPage() {
    return (
        <main className="flex min-h-screen flex-col items-center p-4 sm:p-8 md:p-12">
            <div className="w-full max-w-4xl mx-auto relative">
                <Header />
                <div className="mb-8 pt-16 sm:pt-0">
                    <Button asChild variant="outline" size="sm">
                        <Link href="/">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Back to App
                        </Link>
                    </Button>
                </div>

                <div className="text-center mb-8">
                    <div className="flex justify-center items-center gap-4 mb-4">
                        <Image src="/icons/icon-512x512.png" alt="seQRets Logo" width={48} height={48} priority />
                        <h1 className="font-body text-4xl md:text-5xl font-black text-foreground tracking-tighter">
                            seQRets
                        </h1>
                    </div>
                    <p className="text-lg text-muted-foreground">Version 0.9.0 Pyre</p>
                    <p className="mt-1 text-muted-foreground max-w-xl mx-auto">
                        <span className="font-semibold">Secure. Split. Share.</span> Encrypt, split, and secure your secrets with QR codes using Shamir's Secret Sharing.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    <Card>
                        <CardHeader>
                            <div className="flex items-center gap-3">
                                <Shield className="h-6 w-6 text-primary" />
                                <CardTitle>Security Architecture</CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm text-muted-foreground">
                            <div className="flex items-start gap-2">
                                <Lock className="h-4 w-4 mt-0.5 flex-shrink-0 text-primary" />
                                <p><span className="font-semibold text-foreground">XChaCha20-Poly1305</span> authenticated encryption (AEAD)</p>
                            </div>
                            <div className="flex items-start gap-2">
                                <Key className="h-4 w-4 mt-0.5 flex-shrink-0 text-primary" />
                                <p><span className="font-semibold text-foreground">Argon2id</span> key derivation (64MB memory, 3 iterations)</p>
                            </div>
                            <div className="flex items-start gap-2">
                                <QrCode className="h-4 w-4 mt-0.5 flex-shrink-0 text-primary" />
                                <p><span className="font-semibold text-foreground">Shamir's Secret Sharing</span> for threshold-based backup splitting</p>
                            </div>
                            <p className="pt-2 border-t text-xs">
                                All cryptographic operations run entirely in your browser. Your secrets never leave your device.
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <div className="flex items-center gap-3">
                                <Github className="h-6 w-6" />
                                <CardTitle>Open Source</CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm text-muted-foreground">
                            <p>
                                seQRets is open source. You can review the code, audit the cryptography, and build it yourself.
                            </p>
                            <p className="font-semibold text-foreground">Built with:</p>
                            <ul className="list-disc pl-4 space-y-1">
                                <li>Next.js + React</li>
                                <li>Electron (desktop)</li>
                                <li>@noble/ciphers & @noble/hashes</li>
                                <li>@scure/bip39 (BIP-39 mnemonic support)</li>
                                <li>shamirs-secret-sharing-ts</li>
                                <li>Tailwind CSS + Radix UI</li>
                            </ul>
                        </CardContent>
                    </Card>
                </div>

                <Card className="mb-8">
                    <CardHeader>
                        <CardTitle>How It Works</CardTitle>
                        <CardDescription>A zero-knowledge approach to crypto inheritance</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 text-sm text-muted-foreground">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="p-4 rounded-lg border bg-muted/30 text-center">
                                <div className="text-2xl font-bold text-primary mb-2">1</div>
                                <p className="font-semibold text-foreground">Encrypt</p>
                                <p>Your secret is encrypted with a strong password (and optional keyfile) using military-grade cryptography.</p>
                            </div>
                            <div className="p-4 rounded-lg border bg-muted/30 text-center">
                                <div className="text-2xl font-bold text-primary mb-2">2</div>
                                <p className="font-semibold text-foreground">Split</p>
                                <p>The encrypted data is split into multiple Qard backups using Shamir's Secret Sharing. No single Qard reveals anything.</p>
                            </div>
                            <div className="p-4 rounded-lg border bg-muted/30 text-center">
                                <div className="text-2xl font-bold text-primary mb-2">3</div>
                                <p className="font-semibold text-foreground">Distribute</p>
                                <p>Print, download, or export your Qards. Give them to trusted family members, lawyers, or store in secure locations.</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <footer className="text-center text-sm text-muted-foreground pb-8">
                    <p>&copy; {new Date().getFullYear()} seQRets. All rights reserved.</p>
                    <p className="mt-1">Your security is your responsibility. Use with caution.</p>
                </footer>
            </div>
        </main>
    );
}
