
'use client';

import React from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Shield, Lock, Key, QrCode, Github } from "lucide-react";
import Link from "next/link";
import { Header } from "../components/header";
import { ConnectionStatus } from "../components/connection-status";
import Image from "next/image";
import { useTheme } from "next-themes";

export default function AboutPage() {
    const { resolvedTheme } = useTheme();
    const logoSrc = resolvedTheme === 'dark' ? '/icons/logo-dark.png' : '/icons/logo-light.png';

    return (
        <main className="flex min-h-screen flex-col items-center p-4 sm:p-8 md:p-12">
            <div className="w-full max-w-4xl mx-auto relative">
                <div className="absolute top-4 left-4 z-50">
                    <Button asChild variant="outline" size="sm">
                        <Link href="/">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Back to App
                        </Link>
                    </Button>
                </div>
                <Header />

                <div className="text-center mb-10 pt-16 sm:pt-0">
                    <div className="flex justify-center items-center gap-2.5 mb-6">
                        <Image src={logoSrc} alt="seQRets Logo" width={144} height={144} className="self-start -mt-2" priority />
                        <div>
                            <h1 className="font-body text-5xl md:text-7xl font-black text-foreground tracking-tighter">
                                seQRets
                            </h1>
                            <p className="text-right text-base font-bold text-foreground tracking-wide">
                                Secure. Split. Share.
                            </p>
                        </div>
                    </div>
                    <p className="text-lg text-muted-foreground">Version 0.9.9 🔐 Sanctum — <em>Beta</em></p>
                    <p className="mt-1 text-muted-foreground max-w-xl mx-auto">
                        Encrypt, split, and secure your secrets with QR codes using Shamir's Secret Sharing.
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
                                <p className="text-xl font-bold mb-2"><span className="text-primary">1.</span> <span className="text-foreground">Secure</span></p>
                                <p>Your secret is encrypted with a strong password (and optional keyfile) using military-grade cryptography.</p>
                            </div>
                            <div className="p-4 rounded-lg border bg-muted/30 text-center">
                                <p className="text-xl font-bold mb-2"><span className="text-primary">2.</span> <span className="text-foreground">Split</span></p>
                                <p>The encrypted data is split into multiple Qard backups using Shamir's Secret Sharing. No single Qard reveals anything.</p>
                            </div>
                            <div className="p-4 rounded-lg border bg-muted/30 text-center">
                                <p className="text-xl font-bold mb-2"><span className="text-primary">3.</span> <span className="text-foreground">Share</span></p>
                                <p>Print, download, or export your Qards. Give them to trusted family members, lawyers, or store in secure locations.</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <footer className="text-center text-sm text-muted-foreground mt-8 mb-16">
                    <p>&copy; {new Date().getFullYear()} seQRets. All rights reserved.</p>
                    <p className="mt-1">All data is processed locally. Your security is your responsibility.</p>
                    <p className="mt-1"><ConnectionStatus /></p>
                </footer>
            </div>
        </main>
    );
}
