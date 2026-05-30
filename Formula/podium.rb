class Podium < Formula
  desc "Local-model terminal coding agent optimized for small context windows"
  homepage "https://github.com/haplollc/podium"
  url "https://registry.npmjs.org/podium-cli/-/podium-cli-0.5.1.tgz"
  sha256 "f3b58b8366f4411f1fc7a3d78613fc5fb74bd9260badeed50f89b8bd207e8f71"
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
