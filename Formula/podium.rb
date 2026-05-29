class Podium < Formula
  desc "Local-model terminal coding agent optimized for small context windows"
  homepage "https://github.com/haplollc/podium"
  url "https://registry.npmjs.org/podium-cli/-/podium-cli-0.3.0.tgz"
  sha256 "95a77ea6e1338cbabd9935399f4e9a31abfd0e009408485320f0296ce616fcc0"
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
