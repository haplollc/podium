class Podium < Formula
  desc "Local-model terminal coding agent optimized for small context windows"
  homepage "https://github.com/haplollc/podium"
  url "https://registry.npmjs.org/podium-cli/-/podium-cli-0.4.5.tgz"
  sha256 "2b91d56105f1b772ef2c5169900c89252f247473a0581e757eb9146938a27178"
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
