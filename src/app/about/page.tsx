
'use client';

import React from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Shield, Lock, Key, QrCode, LifeBuoy, Puzzle, Download, Laptop } from "lucide-react";
import { GithubIcon } from "@/components/ui/github-icon";
import Link from "next/link";
import { Header } from "../components/header";
import { AppFooter } from "../components/app-footer";
import Image from "next/image";
import { VERSION_STRING } from "@/generated/version";
export default function AboutPage() {
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
                        <Image src="/icons/logo-light.webp" alt="seQRets Logo" width={144} height={144} className="self-start -mt-2 dark:hidden" priority />
                        <Image src="/icons/logo-dark.webp" alt="seQRets Logo" width={144} height={144} className="self-start -mt-2 hidden dark:block" priority />
                        <div>
                            <h1 className="font-body text-5xl md:text-7xl font-black text-foreground tracking-tighter">
                                seQRets
                            </h1>
                            <p className="text-right text-base font-bold text-foreground tracking-wide">
                                Secure. Split. Share.
                            </p>
                        </div>
                    </div>
                    <p className="text-lg text-muted-foreground">{VERSION_STRING}</p>
                    <p className="mt-1 text-muted-foreground max-w-xl mx-auto">
                        Encrypt, split, and secure your secrets with QR codes using Shamir's Secret Sharing.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    <Card>
                        <CardHeader>
                            <div className="flex items-center gap-3">
                                <Shield className="h-6 w-6 text-primary dark:text-[#fbbf24]" />
                                <CardTitle>Security Architecture</CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm text-muted-foreground">
                            <div className="flex items-start gap-2">
                                <Lock className="h-4 w-4 mt-0.5 flex-shrink-0 text-primary dark:text-[#fbbf24]" />
                                <p><span className="font-semibold text-foreground">XChaCha20-Poly1305</span> authenticated encryption (AEAD)</p>
                            </div>
                            <div className="flex items-start gap-2">
                                <Key className="h-4 w-4 mt-0.5 flex-shrink-0 text-primary dark:text-[#fbbf24]" />
                                <p><span className="font-semibold text-foreground">Argon2id</span> key derivation (64MB memory, 4 iterations)</p>
                            </div>
                            <div className="flex items-start gap-2">
                                <QrCode className="h-4 w-4 mt-0.5 flex-shrink-0 text-primary dark:text-[#34d399]" />
                                <p><span className="font-semibold text-foreground">Shamir's Secret Sharing</span> for threshold-based backup splitting</p>
                            </div>
                            <p className="pt-2 border-t text-xs">
                                <em>All cryptographic operations run entirely in your browser. Your secrets never leave your device.</em>
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <div className="flex items-center gap-3">
                                <GithubIcon className="h-6 w-6 text-primary dark:text-[#38bdf8]" />
                                <CardTitle>Open Source</CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm text-muted-foreground">
                            <p>
                                seQRets is open source. You can <a href="https://github.com/seQRets/seQRets-app" target="_blank" rel="noopener noreferrer" className="underline text-foreground hover:text-primary">review the code</a>, audit the cryptography, and build it yourself.
                            </p>
                            <p className="font-semibold text-foreground">Built with:</p>
                            <ul className="list-disc pl-4 space-y-1">
                                <li>Next.js + React</li>
                                <li>Tauri v2 + Rust (desktop)</li>
                                <li>@noble/ciphers & @noble/hashes</li>
                                <li>@scure/bip39 (BIP-39 mnemonic support)</li>
                                <li>shamir-secret-sharing (audited by Cure53 + Zellic)</li>
                                <li>Tailwind CSS + Radix UI</li>
                            </ul>
                        </CardContent>
                    </Card>
                </div>

                <Card className="mb-8">
                    <CardHeader>
                        <CardTitle>Using seQRets in a Browser? Make It as Safe as It Can Be</CardTitle>
                        <CardDescription>Three small habits that meaningfully reduce risk</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 text-sm text-muted-foreground">
                        <div className="flex items-start gap-2.5">
                            <Puzzle className="h-4 w-4 mt-0.5 flex-shrink-0 text-primary dark:text-[#fbbf24]" />
                            <p>
                                <span className="font-semibold text-foreground">Keep extensions away from your secrets.</span>
                                {' '}Browser extensions can read whatever is on your screen — including a seed phrase.
                                Use seQRets in a private/incognito window (where extensions are usually off), or in a
                                separate browser you keep just for seQRets, with no extensions installed.
                            </p>
                        </div>
                        <div className="flex items-start gap-2.5">
                            <Download className="h-4 w-4 mt-0.5 flex-shrink-0 text-primary dark:text-[#34d399]" />
                            <p>
                                <span className="font-semibold text-foreground">Install it as an app.</span>
                                {' '}Use your browser&apos;s &quot;Install&quot; or &quot;Add to Home Screen&quot; option. The installed
                                app keeps its own copy of the code and works fully offline — you can even disconnect
                                from the internet before typing your secret.
                            </p>
                        </div>
                        <div className="flex items-start gap-2.5">
                            <Laptop className="h-4 w-4 mt-0.5 flex-shrink-0 text-primary dark:text-[#38bdf8]" />
                            <p>
                                <span className="font-semibold text-foreground">Want guarantees a browser can&apos;t make?</span>
                                {' '}The <Link href="/go-pro" className="underline text-foreground hover:text-primary">seQRets desktop app</Link> runs
                                its cryptography in native code outside the browser entirely, stores keys in your
                                computer&apos;s secure keychain, and supports smart cards.
                            </p>
                        </div>
                    </CardContent>
                </Card>

                <Card className="mb-8">
                    <CardHeader>
                        <CardTitle>How It Works</CardTitle>
                        <CardDescription>A zero-knowledge approach to crypto inheritance</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 text-sm text-muted-foreground">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="p-4 rounded-lg border bg-[#cbc5ba] dark:bg-muted text-center">
                                <p className="text-xl font-bold mb-2"><span className="text-primary dark:text-[#fbbf24]">1.</span> <span className="text-foreground">Secure</span></p>
                                <p>Your secret is encrypted with a strong password (and optional keyfile) using military-grade cryptography.</p>
                            </div>
                            <div className="p-4 rounded-lg border bg-[#cbc5ba] dark:bg-muted text-center">
                                <p className="text-xl font-bold mb-2"><span className="text-primary dark:text-[#34d399]">2.</span> <span className="text-foreground">Split</span></p>
                                <p>The encrypted data is split into multiple Qard backups using Shamir's Secret Sharing. No single Qard reveals anything.</p>
                            </div>
                            <div className="p-4 rounded-lg border bg-[#cbc5ba] dark:bg-muted text-center">
                                <p className="text-xl font-bold mb-2"><span className="text-primary dark:text-[#38bdf8]">3.</span> <span className="text-foreground">Share</span></p>
                                <p>Print, download, or export your Qards. Give them to trusted family members, lawyers, or store in secure locations.</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="mb-8">
                    <CardHeader>
                        <div className="flex items-center gap-3">
                            <LifeBuoy className="h-6 w-6 text-primary dark:text-[#fbbf24]" />
                            <CardTitle>seQRets Recover</CardTitle>
                        </div>
                        <CardDescription>Long-term recovery, even if seQRets disappears</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 text-sm text-muted-foreground">
                        <p>
                            <a href="https://github.com/seQRets/seQRets-Recover" target="_blank" rel="noopener noreferrer" className="underline text-foreground hover:text-primary">seQRets Recover</a> is an independent, single-file recovery tool for the seQRets share format. One HTML file, ~200 lines of TypeScript, no install, no network. Open it in any modern browser, offline, and paste your Qards in.
                        </p>
                        <p>
                            Save a copy of <code className="text-xs px-1 py-0.5 rounded bg-muted">recover.html</code> alongside your Qards. Anyone holding the threshold of Qards plus the password can recover the secret with nothing but a web browser.
                        </p>
                        <div className="flex flex-wrap gap-2 pt-2">
                            <a
                                href="https://github.com/seQRets/seQRets-Recover/releases/latest/download/recover.html"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground transition-all hover:bg-primary/80 hover:shadow-md"
                            >
                                <LifeBuoy className="h-3.5 w-3.5" />
                                Download recover.html
                            </a>
                            <a
                                href="https://github.com/seQRets/seQRets-Recover"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                            >
                                <GithubIcon className="h-3.5 w-3.5" />
                                View source
                            </a>
                        </div>
                        <p className="pt-2 border-t text-xs">
                            <em>Every release publishes a SHA-256 hash so you can verify the copy you hand to heirs is untampered.</em>
                        </p>
                    </CardContent>
                </Card>

                <AppFooter />
            </div>
        </main>
    );
}
