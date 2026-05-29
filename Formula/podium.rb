class Podium < Formula
  desc "Local-model terminal coding agent optimized for small context windows"
  homepage "https://github.com/haplollc/podium"
  url "https://registry.npmjs.org/podium-cli/-/podium-cli-0.3.1.tgz"
  sha256 "5af2b0b74098d8f171fb8133c5174ccca59d8b71629a3b17b4f6143000751828"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    assert_match "podium", shell_output("#{bin}/podium --help")
  end
end
