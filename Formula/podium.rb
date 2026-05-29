class Podium < Formula
  desc "Local-model terminal coding agent optimized for small context windows"
  homepage "https://github.com/haplollc/podium"
  url "https://registry.npmjs.org/podium-cli/-/podium-cli-0.3.10.tgz"
  sha256 "31c6d26bbe208486601a28b950828073a03d307170209766adb6d57889b9e23b"
  license "MIT"

  depends_on "node"
  depends_on "ollama"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  def caveats
    <<~EOS
      Podium starts Ollama automatically on launch. Just run:
        podium
    EOS
  end

  test do
    assert_match "podium", shell_output("#{bin}/podium --help")
  end
end
